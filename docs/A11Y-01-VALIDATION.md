# A11Y-01: PDF figure export remediation

September 9, 2026. Pandion Plots 3.1.1 working copy. The missing PDF figure
structure is fixed in the local source, portable application and website build.
Institutional PDF-reader/screen-reader acceptance and the adequacy of each
author's descriptions remain open. No PDF/UA or full WCAG/Title II conformance
claim is made.

## What changed

The standalone PDF boundary now writes PDF 1.7 with a Document structure element
and one Figure per exported page. Each Figure has a full Unicode `/Alt` string
and a page/content reference. Marked drawing operators, page `/StructParents`,
the reverse parent tree, `/MarkInfo`, English `/Lang` and document-title display
preferences are present. Notebook figures follow the exported page order. The
implementation uses serialization events in the bundled jsPDF 3.0.4; dependency
upgrades must pass the structural checks before release.

Chart/layout PDFs use the export dialog's description; visible chart captions
are included in the alternative. Newly kept Notebook pages freeze their chart
description with the capture. Exports use that retained description even after
the live chart changes or the project is reopened. Included record details,
notes and comparison text remain available in the Figure alternative. A record
that the user excludes is also excluded from the vector page's alternative.

Older vector pages fall back to their saved descriptions or retained source and
visible labels. Older bitmap pages use their recorded source and written note;
the note is available as alternative text even though those legacy images
cannot receive the vector record band. This preserves compatibility but does
not infer the meaning of old charts: authors must review them. Malformed Unicode
and control characters use the same literal escape notation as visible exports;
stored originals remain unchanged.

The exporter explains tagged figure alternatives and asks authors to review the
finding and important values. Exact-value coursework needs an accessible
companion table where the figure description does not provide the required
information. A single Figure tag does not create table-cell navigation or
semantic navigation among panels.

The approach follows W3C's distinction between a figure alternative and document
metadata, and between logical structure order and paint order:
[PDF1: image alternatives](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1),
[PDF3: reading order](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF3).

## Verification

`standalone/verify/pdf-accessibility-check.mjs` creates nine PDFs (12 pages)
through real export routes: generated chart description, custom Unicode and
delimiter characters, repeated export, caption, two-page Notebook, omitted
record, legacy vector/bitmap captures, a saved description over 2,000 characters,
and a real two-panel layout. Notebook exports are checked after a project
round trip and later chart-description changes; stored captures must remain
identical before and after exporting.

`pdf-structure-check.py`, using pypdf 6.10.0 in strict mode, resolves both
directions of the structure/parent tree, verifies page relationships, language,
title and exact alternative text, and parses decompressed drawing operators.
Every page's visible operators must be enclosed in one balanced Figure marked
sequence. Vector text/drawing must remain vector; the legacy bitmap must remain
present. Five deliberately damaged PDFs must be rejected: missing structure,
wrong alternative, wrong page key, broken reverse lookup, and unmarked drawing.
Metadata-only output from the pre-fix exporter does not meet this contract.

The checks pass on the source application, rebuilt portable HTML and rebuilt
website application. They are included in the standalone verification runner
and the release statistics/validation workflow for source and portable builds;
the workflow installs pypdf explicitly. The GitHub-hosted workflow itself was
not dispatched during this work.

Additional passing regressions: export accessibility, Notebook record details,
XML-safe SVG/PNG/PDF export, kept-page fidelity, Notebook drift, layout fonts
before/after reopening, and modal accessibility. Artifact parity and the shared
renderer hash checks pass. Statistical implementation and renderer source were
not changed by this remediation.

Poppler recognizes the emitted PDFs as tagged. All 12 source pages rendered
pixel-identically to matching exports from the saved pre-fix shell at a
1,400-pixel maximum dimension. The two-panel layout and Notebook record page
were visually inspected as well. Structural additions preserve visible output.

Evidence: [source log](../planning/a11y-01-fixes-2026-09-09/source.log),
[portable log](../planning/a11y-01-fixes-2026-09-09/portable.log),
[website log](../planning/a11y-01-fixes-2026-09-09/web.log),
[render comparison](../planning/a11y-01-fixes-2026-09-09/render-comparison.json),
[artifact parity](../planning/a11y-01-fixes-2026-09-09/artifact-parity.log).
The [verification receipt](../planning/a11y-01-fixes-2026-09-09/verification.json)
records final file hashes, log outcomes and rejection of the pre-fix PDF.
The pre-fix source snapshot and initial worktree status are retained alongside
these records; unrelated existing work was preserved.

To repeat locally (Playwright/Chromium and pypdf 6.10.0 required):

```sh
node standalone/verify/pdf-accessibility-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/pdf-accessibility-check.mjs
PS_PAGE=website/app/index.html node standalone/verify/pdf-accessibility-check.mjs
```

`PS_PYTHON` selects the Python executable. `PS_PDF_OUT` retains the generated
fixtures and manifest. `PS_PDF_BASELINE=1` is explicitly capture-only and must
never be treated as a successful verification run.

## Remaining acceptance

Use the university's supported PDF reader and screen reader to read a chart,
multi-panel figure and multi-page Notebook, including a legacy page. Confirm
the alternative is announced once, notes/captions are understandable, page
order is correct, and the assignment's required relationships and numbers are
available. Review non-English descriptions because these exports declare
English as the default language. Core PDF fonts remain the existing unembedded
fonts; this change does not claim PDF/UA font conformance.

The tests exercised the export pipeline and browser download fallback, not a
native Save dialog, an installed Electron release, jamovi's own PDF writer, an
LMS upload, or assistive-technology speech. Native installers were not packaged
and the website was not published. The rebuilt portable payload is available
for the next Electron/release build.
