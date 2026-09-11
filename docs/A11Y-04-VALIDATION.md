# A11Y-04: Retired website prototypes excluded from deployment

September 10, 2026. Pandion Plots 3.1.1 working copy.

## Change

After reviewing both designs, the owner authorized their removal. The raw
`website/v2.html` and `website/v3.html` files moved unchanged to
[`prototypes/website/`](../prototypes/website/README.md). That directory is
outside the `website/` asset root used by `wrangler.jsonc` and the documented
Cloudflare Pages deployment.

The bundled `pandion-site-preview.html` also contained those designs. It moved
outside the deployment folder, and `website/build-preview.py` now reads the
archived variants and writes its review output under `prototypes/website/`.
The generated preview remains gitignored. Release version synchronization and
its existing test fixture no longer expect the retired public pages; historical
prototype copy stays frozen. Obsolete prototype headers and robots exclusions
were removed, and website/reference documentation was updated.

## Verification

- SHA-256 comparison confirms both archived raw pages are byte-identical to
  their original files.
- The deployment inventory lost only the two prototypes and bundled preview.
  The four changed website files are documentation, crawler/header settings,
  and the preview builder. All other 172 website files are byte-identical,
  including the current pages, app, guide, images and styles.
- No remaining website HTML links to the retired pages or bundled preview.
- The existing local server returns 404 for all three removed artifact paths,
  and 200 for the homepage, download page and app.
- `node scripts/verify/release-pipeline-check.mjs` passed, including version
  checks and a future-version update in an isolated source copy.
- `node website/verify-accessibility.mjs` passed.
- `python3 website/build-preview.py` passed. The generated preview retains
  all nine selected pages, with the archived designs' assets inlined.
- Changed JavaScript syntax and diff whitespace checks passed.

Evidence: [verification receipt](../planning/a11y-04-fixes-2026-09-10/verification.json),
[local inventory](../planning/a11y-04-fixes-2026-09-10/local-inventory.json),
[local URL checks](../planning/a11y-04-fixes-2026-09-10/local-http.json).

## Deployment acceptance remaining

This change was made locally; no production deployment or push occurred.
After deploying, confirm that `/v2.html`, `/v3.html` and
`/pandion-site-preview.html` no longer serve those artifacts, including any
extensionless or cached forms the production host supports. Verify that the
intended public pages still load on the actual origin.

The original contrast findings remain historical evidence. The archived
designs have not been recolored or certified; excluding them from deployment
does not establish whole-site accessibility conformance. Current-page manual
contrast and classroom acceptance work remain as recorded in the audit.
