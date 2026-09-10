# Accessibility regression and review evidence

Build the current portable and website artifacts, then run the required gate:

```sh
bash standalone/build-dist.sh
bash website/build.sh
bash scripts/verify/accessibility-run.sh
```

The runner requires Node 20, Playwright/Chromium, axe-core, R with jmvcore/R6/
jsonlite, and Python with pypdf 6.10.0. It does not install dependencies or
publish anything. CI provides its own dependencies. `GB2_NODE_BASE` selects a
Node dependency directory; `PS_PYTHON` selects the PDF-check Python executable.
`PS_A11Y_OUT` selects the evidence folder, defaulting to
`planning/accessibility-release`. Never use `PS_PDF_BASELINE=1` for acceptance;
the runner rejects capture-only mode.

## What blocks the engineering gate

All axe violations selected by the WCAG 2.0/2.1 A/AA and 2.2 A/AA tags block,
including minor, moderate and unknown impacts. Reports distinguish the 2.1
baseline from additional 2.2 rules. The policy does not infer compliance from
a severity score. Browser/contract failures, missing required fixtures and
missing dependencies also fail. PDF structure is checked independently using
the existing real-export and damaged-PDF negative controls.

The R fixtures contain raw widget fragments. Their document-title and
html-has-lang findings remain in the report as open `host-responsibility`
items; installed jamovi must supply and verify that document wrapper. The
exception does not apply to standalone or website pages, or to other widget
violations. The chooser fragment is required, along with all seven chart
families. These are browser tests of R output, not installed-host acceptance.

## Reading the reports

`run.log` retains the full runner output. Separate source, portable and hosted
folders contain `shell.json`, `charts.json` and the PDF fixtures/manifest. The
setting-search lifecycle report (`setting-search-chromium.json`) records
closed/open/result/Escape/rebuild relationships for all seven families.
`chart-statistics-names.json` and `host-statistics-names.json` retain the
visible labels/results and accessible names across Statistics subpanels;
these checks reject definition actions that omit their displayed result.
The
website folder contains the discovered HTML inventory and page/state scans.
The host-source and host-min folders retain generated R fixtures and their
scan reports. Every scan retains all violating and incomplete nodes/check
details, scanner version, viewport, selected rule tags and document checksum.
Passing/inapplicable rule IDs are retained as the sampled rule inventory.

Report status has four meanings:

| Status | Meaning |
| --- | --- |
| `in-progress` | Partial evidence; the scan sequence has not finished. |
| `failed` | A blocking violation or execution/contract failure occurred. |
| `automated-pass-review-required` | Automatic checks passed; explicit review items remain open. |
| `automated-pass` | The sampled scan has no automatic violations or incomplete findings. This still does not cover untested criteria/workflows. |

The review queue is intentionally unresolved when the scanner cannot decide.
It is neither a list of confirmed defects nor a list of accepted exceptions.
One rule repeated across many pages or states creates multiple queue entries;
the count is not a count of unique defects or a compliance percentage.

For each relevant item, the maintainer and university evaluator should record
the state/node, build and platform, observed behavior, criterion, outcome,
reviewer/date and supporting evidence. A confirmed defect needs a fix and
retest. A false positive needs a specific technical explanation and evidence.
A host-owned issue remains open until tested in the delivered host. Preserve
the original raw report alongside this decision record. Do not clear a whole
rule category because one instance was acceptable.

Current recurring review categories include dynamically created
setting-search relationships and contrast involving SVG,
images, gradients or native controls. R-fragment bypass navigation also needs
review in its actual host. Inspect these items in their recorded states.
The previously deferred chart-palette contrast work remains separate; a clean
axe result does not resolve it. Full assignments, actual browser zoom, PDF
readers and the university's assistive technologies remain human acceptance
work under A11Y-07.

The [A11Y-07 review ledger](A11Y-07-VALIDATION.md) records the corrected
brand/Layout generic-container naming issues and the bounded technical review
of setting-search relationships. Its [classroom acceptance pack](accessibility-classroom/README.md)
provides a browser/jamovi assignment, synthetic fixture, answer key, platform
matrix and session record. Rehearse the fixture locally with
`node standalone/verify/classroom-fixture-check.mjs`; this uses locator/API
assistance and must not be entered as a human acceptance session.

## Coverage and maintenance

The website inventory discovers every HTML file recursively. Current app and
portable routes are explicitly assigned to application gates; all other pages
receive desktop and narrow scans. Teaching edition switches, visible hints,
mobile navigation and guide interactions are opened before scanning. Add new
interaction types to the state roster when introducing them; automatic file
discovery cannot infer every possible workflow.

The normal standalone runner saves separate source/portable reports. The
normal shared-engine runner requires the host scan without `--extras`.
Local release preparation runs the dedicated gate, and the tag workflow
requires the reusable accessibility job before publishing. CI uploads evidence
even when checks fail. Evidence artifacts are excluded from release downloads.
The GitHub job itself must pass on the release commit; a local run is not a
substitute for that CI result.
