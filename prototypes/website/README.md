# Retired website designs

`v2.html` (dark hero) and `v3.html` (editorial serif) are unchanged snapshots
removed from `website/` on September 10, 2026 at the owner's request. They are
internal design references, not supported public pages. Their known text
contrast issues and old download copy have not been remediated.

This directory is outside the static deployment root configured in
`wrangler.jsonc` and the Cloudflare Pages instructions. Do not deploy it or
copy these files into `website/`. Release version updates intentionally leave
these historical designs untouched.

The raw HTML retains its original relative asset paths. For a usable local
preview with images, styles and navigation bundled, run from the repository:

```sh
python3 website/build-preview.py
```

Open the generated `prototypes/website/pandion-site-preview.html` and select
**Landing: dark** or **Landing: editorial**. The generated file is gitignored.
It also includes selected current pages for comparison; it is a local review
artifact and must stay outside the published site.
