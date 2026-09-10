# A11Y-06: Accessibility gates and retained review evidence

September 10, 2026. Pandion Plots 3.1.1 working copy.

## Implemented changes

The shell, chart-family, website and R-host scanners share one reporting policy.
Every selected A/AA violation blocks at every impact level, including unknown
impact. WCAG 2.0/2.1 A/AA findings are labelled as the 2.1 baseline; 2.2 A/AA
rules are labelled separately. All violation and incomplete nodes and check
details are retained with the state, viewport, scanner metadata and document
checksum. Partial reports survive later failures. Zero scanned states cannot
produce a passing report.

Scanner uncertainty stays in an open review queue. The two R fragment wrapper
rules are retained explicitly as host responsibilities, rather than filtered
out. All other R-host violations block. The host scan now requires a fixture
from each of the seven chart families and the chooser, and runs in the normal
shared verification battery rather than optional extras.

The website inventory discovers all 27 current HTML delivery paths. Twenty-five
site/guide pages receive page scans; the hosted app and portable-download paths
are assigned explicitly to application checks. Teaching edition switches,
visible workshop hints, each page's mobile navigation and guide interactions
are included, producing 117 website page/state scans in the current roster.
New HTML pages are discovered automatically; novel interaction types still
need explicit state coverage.

The required runner covers source, portable and hosted applications, the
website and source/minified R hosts. It retains PDF structure checks through
real chart, layout and Notebook exports, including damaged-PDF negative
controls. PDF capture-only mode is rejected. Local release preparation invokes
the runner; the tag workflow requires its CI job before release publication.
CI retains evidence on failures, and the release download step selects only
Jamovi and desktop delivery artifacts so it cannot publish the review records
as installers. The ordinary standalone runner also retains separate source and
portable scan reports.

This pass changes verification tooling and documentation. Product UI,
statistics, chart palettes and data operations are unchanged. Rebuilding the
portable and website artifacts retains their current source parity.

## Evidence and verification scope

The [evidence folder](../planning/a11y-06-fixes-2026-09-10/) retains the original
tooling snapshots, policy controls, scan results, build logs and integration
runs. The [final receipt](../planning/a11y-06-fixes-2026-09-10/verification.json)
records completed checks and file hashes.

The complete local release gate passed with Playwright 1.62.1, Chromium and
axe-core 4.11.0. Its final scanner coverage is:

| Surface | Scanned states | Blocking rules | Open rule/state review entries |
| --- | ---: | ---: | ---: |
| Source shell and chart families | 49 | 0 | 70 |
| Portable shell and chart families | 49 | 0 | 70 |
| Hosted shell and chart families | 49 | 0 | 70 |
| Website and guide | 117 | 0 | 29 |
| Source R hosts | 10 | 0 | 47 |
| Minified R hosts | 10 | 0 | 47 |
| Total | 284 | 0 | 333 |

The 333 entries include repeated states and editions, not 333 unique defects.
Forty are the explicitly retained R wrapper responsibilities; the others are
scanner-incomplete results. All remain open. The source, portable and hosted
reflow and export checks also passed. Each edition generated nine PDFs (12
pages) for independent structure checking, including the five damaged-file
negative controls. Artifact parity, release-wiring contracts, syntax and
whitespace checks passed. Product source and generated application bytes match
the A11Y-05 verification hashes.

The policy's negative controls cover minor/moderate/serious/critical/unknown
violations, additional 2.2 rules, fragment-wrapper scope, zero scans, page
errors, durable partial evidence, preservation of incomplete node details,
newly added/nested teaching pages and missing application artifacts. Stubbed
command tests confirm that a failed PDF checker stops the runner and prevents
its success marker, and that capture-only mode cannot satisfy the release gate.
These orchestration tests do not substitute for the real export checks.
A separate real R-host run with only the chooser fixture removed failed as
expected; the previously optional chooser can no longer disappear silently.

The retained open review categories include generic-element ARIA labels,
dynamically created ARIA references, contrast the scanner cannot determine,
R-fragment bypass navigation, and actual Jamovi document title/language. Repeated state findings are not
unique defects. They require the [documented review process](ACCESSIBILITY-REGRESSION.md),
not automatic dismissal. The deferred palette item A11Y-02 remains open.

The GitHub-hosted workflow was not dispatched during this local change. Actual
installed jamovi/Electron, Safari zoom, screen-reader/PDF-reader operation and
complete university assignments remain A11Y-07 acceptance work. No release
was published and no site was deployed. The automated gate is not a full WCAG
conformance or Title II compliance determination.
