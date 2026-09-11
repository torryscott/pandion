# XML-safe label and export validation

The control-character export failure found during facet validation is corrected
locally (2026-09-06). A facet label containing U+0001 previously made the
standalone exporter reject the chart SVG. This was a serialization failure;
the original data and facet-specific statistics were not corrupted.

## Contract

- XML 1.0 cannot contain U+0000–0008, U+000B/C, U+000E–001F,
  lone UTF-16 surrogates, or U+FFFE/FFFF. Render these as visible ASCII
  escapes such as `\u0001`. Preserve legal Unicode, including supplementary
  pairs, and the existing handling of spaces, tabs and line breaks.
- Escape chart text before measurement. Figure-note, caption, comparison-card
  and layout wrapping must measure the text that the exported file displays.
- Never normalize table values or model keys. Live group/facet attributes
  retain their exact identity. Only export clones receive XML-safe attributes.
- When an attribute needs escaping, `data-gb2-raw-attributes` retains its
  original value as XML-safe JSON. `data-gb2-raw-text` retains the original
  displayed string for text editors and exported text elements. Decode these
  JSON fields when recovering an escaped identity; the displayed escape
  notation is not itself a unique identifier. In particular, an actual control
  character and a literal string spelling `\u0001` must never pool observations,
  even though their display spellings can coincide.
- Text editors must read the original value, including multiline content,
  rather than saving display escapes back into chart options.
- Apply the export boundary to the shared Jamovi serializer and to standalone
  figure exports, captions, accessibility metadata, Notebook captures,
  comparison cards, layout snapshots and layout/Notebook record exports.

The changes do not modify statistical calculations or the project's raw data.
Existing whitespace wrapping remains a presentation rule, not a data edit.

## Retained checks

`standalone/verify/xml-export-check.mjs` checks all 65,536 individual UTF-16
code units and 3,072 supplementary pairs. The native browser XML parser
rejects the unsanitized control fixture and accepts the prepared clone.
The clone check also requires idempotence, no live-DOM mutation and exact
recovery of original attribute values.

Its 34 rendered cases cover every prohibited C0 control, U+FFFE/FFFF, lone
high/low surrogates, and ordinary Unicode/markup/backslash/space content.
Each case uses six facet × group fits, including literal escape spellings.
Checks require exact model identities and live/exported geometry, expected
fit directions and per-cell n, readable labels/notes/captions/descriptions,
and unchanged tables, numeric payloads and chart options after export.
The saved project's raw table must also agree. Additional workflows cover
single/multiline editors, project reopening, Notebook chart capture and a
layout containing a real chart snapshot plus text.

Both a chart and a layout containing unsupported label characters are
converted to SVG, PNG and vector PDF. The fixture retains the files for visual
QA when `PS_XML_OUT` is set. The final focused checks passed with the
unminified renderer (70,437 checks) and portable build (70,436 checks); the
extra source check proves the requested unminified file actually loaded.

`xml-export-host.R` and `xml-export-host-check.mjs` exercise actual R-generated
Jamovi scatter and categorical widgets. They check native SVG-image loading,
escaped text and exact exported model identities/geometry. Both complete
shared-renderer gates now require these fixtures. The standalone gate and
statistics CI require the standalone and portable XML workflow checks.

The independent R facet oracle also passed again on the final portable build:
56 cases, 444,633 comparisons, zero failures. Existing export-accessibility,
layout-text, Notebook fidelity, hardening, artifact-parity and release-pipeline
checks passed. See the release validation record for the full gate results.

## Visual QA and scope

The local minimal Poppler/Fontconfig setup rendered some bold/italic faces
using regular substitutes. Investigation confirmed the PDFs select
Helvetica-Bold and Helvetica-Oblique correctly, and native macOS PDF rendering
shows those styles. An ASCII diagnostic produced byte-identical SVG/PNG
before and after this change, and identical rendered PDFs. This is a QA
renderer limitation, not evidence of a product font regression. Retained
diagnostics include both renderers so this distinction is reviewable.

This is bounded local evidence. It does not replace the complete standalone
release gate on frozen artifacts, native installer/installed-Jamovi checks,
supported-browser and assistive-technology acceptance, deployed-byte checks,
or independent statistical-method review.

Evidence and reproduction commands are in
`planning/release-validation-2026-09-06/xml-export-followup/`.
