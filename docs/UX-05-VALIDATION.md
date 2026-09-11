# UX-05: layout actions in narrow windows

Implemented and verified September 9, 2026.

## Problem and fix

At 900 x 700 with the default side panels, the layout toolbar had 327 pixels
of available width. Its five-action group stayed on one line, placing Panel
label and Add image underneath the settings panel. Mouse hit checks confirmed
that their centers were obscured.

The five actions now participate directly in the toolbar's existing wrapping
row. Removing the unnecessary inner wrapper lets individual buttons move to
the next line. Undo/Redo stay together, and Zoom retains its label and right
alignment. Existing labels, icons, IDs, event handlers, and keyboard order
are retained.

At the default panel widths the toolbar uses three rows at 900 pixels, two
at 1024 and 1176, and one at 1366 and 1500. All actions remain visible without
adding an overflow menu. The shared chart toolbar retains its existing
single-row scrolling behavior and edge cue.

The application change is confined to the layout toolbar's HTML structure in
`standalone/index.html`. Shared renderer source, minified renderer, and shell
JavaScript are byte-identical to the starting working copy.

## Verification

Local Chromium walkthroughs covered the source page, rebuilt portable HTML,
and rebuilt web app. Each delivery was inspected at 900, 1024, 1176, and
1366 pixels, plus two 900-pixel configurations reached by dragging the
settings-panel divider and resizing the project rail with the keyboard.
The narrowest resulting toolbar was 282 pixels wide.

Across all 18 configurations, every toolbar control remained inside the
toolbar and exposed to a mouse hit at its center. Tab followed Add chart,
Add text, From Notebook, Panel label, Add image, and Zoom; Shift+Tab returned
from Zoom to Add image. Focused controls remained visible. Screenshots were
captured and the narrow, wide, and resized layouts were visually inspected.

On all three deliveries, actual activation opened the chart menu and added
a chart, created and edited text, showed the empty-Notebook guidance, added
panel label A with Enter, and opened the image picker and placed the existing
8 x 6 test image. No browser page errors were recorded. These walkthroughs
used the built-in synthetic sample and a repository image fixture.

The following existing regression probes passed on both the source page and
the rebuilt portable app (10 successful runs):

- `layout-accessibility-check`: keyboard navigation and layout operations.
- `layout-image-check`: image placement, manipulation, export, and persistence.
- `toolbar-scroll-cue-check`: shared chart toolbar scrolling and edge cues.
- `launch-eval-fixes-check`: wide layout toolbar alignment and adjacent shell behavior.
- `reflow-accessibility-check`: narrow workspaces, text spacing, and focus visibility.

Portable and web builds passed. The website accessibility contract and
artifact-parity check passed, including identical portable downloads and
current web assets. The numerical and full shared-renderer suites were not
rerun for this HTML-only change; the shared renderer was unchanged.

## Evidence and scope

- [Original clipping measurements](../planning/ux-05-fixes-2026-09-09/before-900.json)
- [Original 900-pixel screenshot](../planning/ux-05-fixes-2026-09-09/before-900.png)
- [Change against the starting working copy](../planning/ux-05-fixes-2026-09-09/layout-change.diff)
- [Delivery and interaction observations](../planning/ux-05-fixes-2026-09-09/delivery-observations.json)
- [Portable app at 900 pixels](../planning/ux-05-fixes-2026-09-09/portable-verified-900.png)
- [Portable app after resizing both panels](../planning/ux-05-fixes-2026-09-09/portable-resized-900.png)
- [Regression results](../planning/ux-05-fixes-2026-09-09/regression-results.json)
- [Build results](../planning/ux-05-fixes-2026-09-09/build-results.json)
- [Final verification receipt](../planning/ux-05-fixes-2026-09-09/verification.json)

This is a standalone layout fix. No native installer was built or installed,
and nothing was published or deployed. Live screen-reader and installed
jamovi acceptance from earlier work remain pending. The related bar-style
selected-state follow-up, UX-06, and UX-07 remain open. Further changes to the
shared chart toolbar's discoverability remain a design review item.
