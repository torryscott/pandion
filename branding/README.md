# Pandion Plots — jamovi ribbon icon

`analysis-pandion.svg` is the ribbon menu-group icon for this module (display name **Pandion Plots**, internal module name **`plotstudio`**), drawn to jamovi's house spec.

## Why it lives here and not in the module

jamovi does **not** load ribbon icons from a module. Every ribbon/menu icon is baked into jamovi's own client bundle (CSS data-URIs keyed by `data-name`). There is no `.a.yaml`/`0000.yaml` field, no compiler step, and no module file jamovi reads for this. Until a jamovi release bundles ours, the **Plot Studio** group shows jamovi's generic placeholder glyph — which is cosmetic only and blocks nothing.

So this file is a **deliverable to submit to the jamovi team**, not a module asset. It is deliberately kept out of `R/`, `jamovi/`, and `inst/widget/` so it never triggers a module rebuild.

## Spec (matches jamovi's own `analysis-*` icons)

- `viewBox="0 0 74 44"` (width 74, height 44).
- Flat fills, 2 px same-hue darker stroke, rounded joins.
- House palette: amber fill `#ebbc66` / stroke `#e6ac40`; blue trend `#3e6da9` with `#6b9de8` nodes.
- Design: four amber bars under a rising blue trend line (a "combo" chart) — reads as "plots" and stays legible at the true 44 px height.
- Public-domain (CC0 1.0) dedication is embedded in the SVG `<metadata>`/`<desc>`, per jamovi's IP request.

## How to submit

It will be keyed **`analysis-pandion`** (jamovi derives the icon id from the *module* name `pandion`, not the display name). Email the SVG to **contact@jamovi.org**. No need to wait for the module to be feature-complete or library-listed — but since the icon only renders once jamovi ships a release that includes it, the natural time to send it is around when you submit Plot Studio to the jamovi library.

### Draft email

> **To:** contact@jamovi.org
> **Subject:** Module ribbon icon submission — pandion (Pandion Plots)
>
> Hi jamovi team,
>
> I maintain a jamovi module, internal name `pandion` (display name **Pandion Plots**), which provides a suite of plot builders under the new **Plots** ribbon tab (`category: plots`). Would you be able to bundle a ribbon icon for it in a future release?
>
> Attached is an SVG drawn to your house spec (74×44, amber/blue, flat with a 2 px stroke), intended to be keyed `analysis-pandion`. It's released into the **public domain (CC0 1.0)** — free for jamovi to bundle and redistribute — and the dedication is embedded in the file's metadata.
>
> Thanks very much,
> Torry Scott Dennis, PhD

## Regenerating a preview

```bash
node /tmp/render_icon.mjs branding/analysis-pandion.svg   # enlarged + actual-size PNG
```

## Superseded

`analysis-plotstudio-SUPERSEDED.svg` is the pre-rename (Plot Studio) ribbon
icon, kept for reference only. jamovi keys the icon by the *module* name, so
the live submission is `analysis-pandion.svg`.
