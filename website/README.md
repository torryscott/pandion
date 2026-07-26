# pandionplots.com

The marketing/download site for Pandion Plots. Pure static files - no
framework, no build step. The `website/` folder IS the deployable site.

## Layout

- `index.html` - the landing page (hero, product shot, downloads,
  gallery teaser, and the "lab / classroom" pillars that carry the
  professional-tool-that-teaches positioning).
- `download.html` - the desktop download chooser. It detects macOS or
  Windows, highlights the matching card, and links directly to the
  installer assets hosted by GitHub Releases. Linux and ChromeOS
  visitors are directed to the browser and portable editions.
- `gallery.html` - real, unretouched chart renders from the app
  (`assets/gallery/*.png`; regenerate with the playwright script in
  the session notes - it loads crafted datasets through PS_SHELL and
  screenshots each chart svg at 2x).
- `about.html` - the developer page (Torry's story, why "Pandion",
  design principles). Personal details Torry may want to add:
  institution, research interests, photo, a contact link.
- `app/index.html` - the full standalone app, copied verbatim from
  `standalone/dist/pandion-plots.html`. This is the "Try it in your
  browser" target at `pandionplots.com/app/`.
- `v2.html` / `v3.html` - alternate DESIGN prototypes of the landing
  page (dark-hero and editorial-serif). Style references only; the
  gallery/about pages are styled to match `index.html`. To adopt a
  variant, rename it to `index.html` and restyle the two subpages.
- `assets/` - brand marks, hero art, product screenshot, gallery.
- `docs/index.html` - the user guide, copied verbatim from the canonical
  `docs/user-guide.html` (plus `docs/img/`). Served at
  `pandionplots.com/docs/`. Refresh it with `build.sh`; never hand-edit
  the copy.
- `build.sh` - refreshes `app/` and `docs/` from the repo sources, and
  warns if the version stated on the site has drifted from
  `DESCRIPTION`.

Note: `app/` only resolves through a real web server (any host serves
`app/index.html` for it). Opening `website/index.html` from disk works
for everything EXCEPT that link, which needs
`python3 -m http.server` or similar to test locally.

## Which mark goes where

The app's own wing mark is the standard icon; the diving osprey is kept
for large showcase art only.

| File | Used for |
| --- | --- |
| `favicon.svg` | The browser tab icon on all pages. Favicon ONLY: it carries a `prefers-color-scheme: dark` rule so the mark stays visible on a dark tab strip. |
| `pandion-wing.svg` | The nav + footer lockups on light surfaces. Deliberately has NO dark-mode rule: it is drawn on permanently white chrome, where a dark-mode swap would turn it white on white. |
| `pandion-wing-light.svg` | The same mark inverted (white + sky blue) for DARK surfaces. Used by `v2.html`, whose header and footer are navy. |
| `icon-180.png` | `apple-touch-icon` (iOS home screen). Opaque white tile, since iOS composites transparency onto black. |
| `pandion-mark.svg` | The diving osprey. LARGE showcase art only: the about-page developer card, and the v2/v3 hero art. |
| `hero-osprey.png` | The full-color osprey render in the `index.html` hero. |

The wing paths in `favicon.svg`, `pandion-wing.svg`, and
`pandion-wing-light.svg` are copied verbatim from the
`ps-pandion-wing` `<symbol>` in `standalone/index.html`, so the site and
the app show the same mark. Change the symbol first, then re-copy.

The app itself (`app/index.html`) carries the same wing as an inline
base64 data URI in its `<head>`. That lives in `standalone/index.html`
(the source) so the portable single-file download keeps its icon with no
repo around it. Never hand-edit `app/index.html` - it is a `cp` of
`standalone/dist/pandion-plots.html`.

To regenerate `icon-180.png`, render `pandion-wing.svg` at 132px centred
on a 180x180 opaque white background.

## Launch fixes (Jul 25 2026)

A pre-launch audit found three things that were actually broken. All are
fixed; the notes matter because two of them can silently come back.

- **The "Download HTML" button 404'd.** It pointed at
  `releases/latest/download/pandion-plots.html`, but CI attaches only
  `*.jmo`, so that asset had never existed. The button now serves
  `pandion-plots.html` from our OWN origin (copied by `build.sh` beside
  the `app/` copy, so it can never drift from what the site runs). CI
  was also patched to build and attach the portable app on every tag,
  for people arriving via GitHub. To backfill the existing release:
  `gh release upload v3.0.0 standalone/dist/pandion-plots.html -R torryscott/pandion`
- **The app reported version 0.9.0-rc1** while every page said 3.0.0,
  and about.html tells readers to look up the version IN the app. Fixed
  at `standalone/js/ps-shell.js` (APP_VERSION). The drift guard in
  `build.sh` now also checks the app bundle, anchored on the
  `APP_VERSION = "x"` DECLARATION: a bare version grep passes vacuously
  because a vendored library already contains the string "3.0.0".
- **"Projects ... open in any of them" was false.** `.pand` does not
  exist anywhere in the jamovi module. The downloads copy now says the
  browser and portable versions share a project file, while jamovi
  charts live in the `.omv`.

Also fixed: the mobile nav used to hide every link except the CTA below
560px (it now wraps), anchor links landed under the sticky header
(`scroll-padding-top`), two colours failed WCAG contrast (card fine
print 3.0:1, the amber kicker 2.2:1), and the About kicker never showed
its colour at all because `.prose p` outranked `.kicker`.

Added: `robots.txt`, `sitemap.xml`, a branded `404.html`, `_headers`
(noindex on the v2/v3 prototypes), canonical + Open Graph + Twitter tags
on all three pages, and `assets/share-card.png`, a purpose-built
1200x630 share image. The previous og:image was the whole 3040px app
screenshot, unreadable as a thumbnail.

NOT deployed: `pandion-site-preview.html` is a local review artifact and
is now gitignored.

## Release facts the site states

These are asserted in several places and go stale silently, so
`build.sh` checks them:

- **Version** appears in the footer of every page, in the downloads
  release line, in the two citation blocks on `about.html`, and in
  `CITATION.cff` at the repo root. The source of truth is `Version:` in
  `DESCRIPTION`.
- **License** is GPL-3.0 (`LICENSE` at the repo root), stated in every
  footer and in the About page's License section.
- **Citation** lives at `about.html#cite` (APA + BibTeX, with copy
  buttons) and is linked from every footer. `CITATION.cff` gives GitHub
  its "Cite this repository" button.

STILL TO DO: mint a DOI. Zenodo can watch the GitHub repo and issue one
per release; once it exists, add it to the APA line, the BibTeX entry
(`doi = {...}`), `CITATION.cff` (`doi:`), and the release line. A DOI is
what makes the software properly citable in a reference list.

## Deploying to Cloudflare Pages (free tier is plenty)

Two options; the first is simplest and keeps deploys tied to git.

**Option A - connect the GitHub repo (recommended):**
1. Cloudflare dashboard -> Workers & Pages -> Create -> Pages ->
   Connect to Git -> pick `torryscott/pandion`.
2. Build settings: Framework preset "None", Build command EMPTY,
   Build output directory `website`.
3. Deploy. Every push to main redeploys automatically.

**Option B - direct upload:**
1. Workers & Pages -> Create -> Pages -> Upload assets.
2. Drag the `website/` folder in. Repeat manually per update.
   (Or from the CLI: `npx wrangler pages deploy website`.)

**Custom domain:** in the Pages project -> Custom domains -> add
`pandionplots.com` (and `www.pandionplots.com` if wanted). If the
domain's DNS is already on Cloudflare this is one click; otherwise
follow the CNAME instructions it prints.

Free-tier limits that matter here: 25 MB per file (the app file is
~3.4 MB), 20k files, unlimited static bandwidth. All fine.

## Download links and release assets

The download cards point at GitHub releases so the site never hosts
binaries:

- Portable HTML card:
  `https://github.com/torryscott/pandion/releases/latest/download/pandion-plots.html`
  -> each release must attach the standalone dist file UNDER THE ASSET
  NAME `pandion-plots.html` (upload `standalone/dist/pandion-plots.html`
  renamed). The `releases/latest` form always serves the newest one.
- jamovi card: links to the releases PAGE (the .jmo asset names vary
  by platform, so users pick theirs).
- Desktop card: links to `download.html`. Its installer buttons use
  stable `/releases/latest/download/` URLs so GitHub serves the files
  without requiring users to browse the GitHub website. Publish release
  assets with these exact names:
  `Pandion-Plots-macOS-arm64.dmg`,
  `Pandion-Plots-macOS-x64.dmg`, and
  `Pandion-Plots-Windows-x64.exe`.

## Updating

1. `bash standalone/build-dist.sh` (if the app changed)
2. `bash website/build.sh`
3. Commit + push (Option A auto-deploys) or re-upload (Option B).
